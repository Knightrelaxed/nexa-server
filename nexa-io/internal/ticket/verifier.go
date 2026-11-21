// Package ticket implements offline Ed25519 ticket verification with single-use
// jti replay protection and scope/expiry enforcement shared by nexa-log and nexa-term
// (FR-AUTH-05, FR-SRV-04 LoadCredential).
package ticket

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	ErrMalformedTicket = errors.New("malformed ticket format")
	ErrInvalidSig      = errors.New("invalid ed25519 ticket signature")
	ErrExpired         = errors.New("ticket expired")
	ErrWrongScope      = errors.New("ticket scope mismatch")
	ErrMissingSID      = errors.New("terminal ticket missing sid")
	ErrMissingDev      = errors.New("ticket missing dev claim")
	ErrMissingJTI      = errors.New("ticket missing jti")
	ErrReplayedJTI     = errors.New("ticket jti already consumed")
)

const (
	// Small clock skew allowance between Node.js issuer and Go sidecar on same host.
	maxClockSkewSec = 5
	// Maximum ticket lifetime accepted (guards against malformed far-future exp).
	maxTicketTTLSec = 120
	// Maximum raw ticket length accepted (G-L2).
	maxTicketBytes = 4096
)

// Claims matches the JSON payload signed by Node.js TicketService.
type Claims struct {
	Scope string `json:"scope"`
	SID   string `json:"sid"`
	Exp   int64  `json:"exp"`
	JTI   string `json:"jti"`
	Dev   string `json:"dev"`
}

// Verifier verifies Ed25519 tickets offline and tracks single-use JTI values.
type Verifier struct {
	pubKey  ed25519.PublicKey
	nowFn   func() time.Time
	mu      sync.Mutex
	seenJTI map[string]int64 // jti -> exp unix seconds
}

// NewVerifier creates a ticket verifier pinned to an Ed25519 public key.
func NewVerifier(pubKey ed25519.PublicKey) (*Verifier, error) {
	if len(pubKey) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("invalid ed25519 public key size: %d", len(pubKey))
	}
	return &Verifier{
		pubKey:  pubKey,
		nowFn:   time.Now,
		seenJTI: make(map[string]int64),
	}, nil
}

// LoadPublicKeyFromPEM parses an Ed25519 SPKI PEM public key.
func LoadPublicKeyFromPEM(pemBytes []byte) (ed25519.PublicKey, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse PKIX public key: %w", err)
	}
	pub, ok := parsed.(ed25519.PublicKey)
	if !ok {
		return nil, errors.New("public key is not Ed25519")
	}
	return pub, nil
}

// LoadPublicKeyFromCredential loads the ticket public key from systemd's
// CREDENTIALS_DIRECTORY first (FR-SRV-04 LoadCredential), falling back to
// fallbackPath for local/CLI verification.
func LoadPublicKeyFromCredential(credName, fallbackPath string) (ed25519.PublicKey, error) {
	credDir := strings.TrimSpace(os.Getenv("CREDENTIALS_DIRECTORY"))
	target := fallbackPath
	if credDir != "" {
		target = filepath.Join(credDir, credName)
	}
	if target == "" {
		return nil, errors.New("no ticket public key path configured")
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return nil, fmt.Errorf("read ticket public key %s: %w", target, err)
	}
	return LoadPublicKeyFromPEM(data)
}

// Verify validates signature, expiry, scope, sid, dev, and consumes jti atomically.
func (v *Verifier) Verify(ticketStr, expectedScope string) (*Claims, error) {
	trimmed := strings.TrimSpace(ticketStr)
	if len(trimmed) == 0 || len(trimmed) > maxTicketBytes {
		return nil, ErrMalformedTicket
	}
	parts := strings.Split(trimmed, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, ErrMalformedTicket
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, ErrMalformedTicket
	}
	sigBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(sigBytes) != ed25519.SignatureSize {
		return nil, ErrMalformedTicket
	}

	if !ed25519.Verify(v.pubKey, payloadBytes, sigBytes) {
		return nil, ErrInvalidSig
	}

	var claims Claims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, ErrMalformedTicket
	}

	if claims.JTI == "" {
		return nil, ErrMissingJTI
	}

	nowSec := v.nowFn().Unix()
	if claims.Exp <= nowSec-maxClockSkewSec {
		return nil, ErrExpired
	}
	if claims.Exp > nowSec+maxTicketTTLSec {
		return nil, ErrMalformedTicket
	}

	if expectedScope != "" && claims.Scope != expectedScope {
		return nil, ErrWrongScope
	}

	if claims.Scope == "term" {
		if strings.TrimSpace(claims.SID) == "" {
			return nil, ErrMissingSID
		}
		if strings.TrimSpace(claims.Dev) == "" {
			return nil, ErrMissingDev
		}
	}

	v.mu.Lock()
	defer v.mu.Unlock()

	// Opportunistic sweep of expired JTI entries
	for k, exp := range v.seenJTI {
		if exp <= nowSec-maxClockSkewSec {
			delete(v.seenJTI, k)
		}
	}

	if _, alreadyUsed := v.seenJTI[claims.JTI]; alreadyUsed {
		return nil, ErrReplayedJTI
	}
	v.seenJTI[claims.JTI] = claims.Exp

	return &claims, nil
}
