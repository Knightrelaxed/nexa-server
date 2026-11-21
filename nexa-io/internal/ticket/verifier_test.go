package ticket

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"testing"
	"time"
)

func makeTestTicket(t *testing.T, priv ed25519.PrivateKey, claims Claims) string {
	t.Helper()
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}
	sig := ed25519.Sign(priv, payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func TestVerifierValidAndReplayRejected(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	v, err := NewVerifier(pub)
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}

	fixedNow := time.Unix(1_763_600_000, 0)
	v.nowFn = func() time.Time { return fixedNow }

	tk := makeTestTicket(t, priv, Claims{
		Scope: "logs",
		SID:   "",
		Exp:   fixedNow.Unix() + 45,
		JTI:   "jti-unique-001",
		Dev:   "samsung-a33-tuan",
	})

	claims, err := v.Verify(tk, "logs")
	if err != nil {
		t.Fatalf("expected valid ticket, got err: %v", err)
	}
	if claims.Dev != "samsung-a33-tuan" || claims.Scope != "logs" {
		t.Fatalf("unexpected claims: %+v", claims)
	}

	// Second use of same jti must fail
	if _, err := v.Verify(tk, "logs"); !errors.Is(err, ErrReplayedJTI) {
		t.Fatalf("expected ErrReplayedJTI, got: %v", err)
	}
}

func TestVerifierRejectsExpiredWrongScopeBadSigAndMissingTermSID(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	_, otherPriv, _ := ed25519.GenerateKey(rand.Reader)
	v, _ := NewVerifier(pub)

	fixedNow := time.Unix(1_763_600_000, 0)
	v.nowFn = func() time.Time { return fixedNow }

	// 1. Expired ticket
	expiredTk := makeTestTicket(t, priv, Claims{
		Scope: "logs",
		Exp:   fixedNow.Unix() - 10,
		JTI:   "jti-exp-1",
	})
	if _, err := v.Verify(expiredTk, "logs"); !errors.Is(err, ErrExpired) {
		t.Fatalf("expected ErrExpired, got: %v", err)
	}

	// 2. Scope mismatch (logs ticket used against term)
	logsTk := makeTestTicket(t, priv, Claims{
		Scope: "logs",
		Exp:   fixedNow.Unix() + 45,
		JTI:   "jti-scope-1",
	})
	if _, err := v.Verify(logsTk, "term"); !errors.Is(err, ErrWrongScope) {
		t.Fatalf("expected ErrWrongScope, got: %v", err)
	}

	// 3. Wrong signing key
	forgedTk := makeTestTicket(t, otherPriv, Claims{
		Scope: "logs",
		Exp:   fixedNow.Unix() + 45,
		JTI:   "jti-forged-1",
	})
	if _, err := v.Verify(forgedTk, "logs"); !errors.Is(err, ErrInvalidSig) {
		t.Fatalf("expected ErrInvalidSig, got: %v", err)
	}

	// 4. Terminal ticket missing sid
	noSidTermTk := makeTestTicket(t, priv, Claims{
		Scope: "term",
		SID:   "",
		Exp:   fixedNow.Unix() + 45,
		JTI:   "jti-nosid-1",
	})
	if _, err := v.Verify(noSidTermTk, "term"); !errors.Is(err, ErrMissingSID) {
		t.Fatalf("expected ErrMissingSID, got: %v", err)
	}

	// 5. M5: Far-future ticket TTL (> 75s) must be rejected so tickets cannot survive idle restart
	farFutureTk := makeTestTicket(t, priv, Claims{
		Scope: "logs",
		Exp:   fixedNow.Unix() + 90,
		JTI:   "jti-far-1",
	})
	if _, err := v.Verify(farFutureTk, "logs"); !errors.Is(err, ErrMalformedTicket) {
		t.Fatalf("expected ErrMalformedTicket for TTL > 75s (M5), got: %v", err)
	}

	// 6. M5: Whitespace-only JTI must be rejected
	blankJtiTk := makeTestTicket(t, priv, Claims{
		Scope: "logs",
		Exp:   fixedNow.Unix() + 45,
		JTI:   "   ",
	})
	if _, err := v.Verify(blankJtiTk, "logs"); !errors.Is(err, ErrMissingJTI) {
		t.Fatalf("expected ErrMissingJTI for blank JTI, got: %v", err)
	}
}

func TestLoadPublicKeyFromPEM(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	spki, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		t.Fatalf("marshal pkix: %v", err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: spki})

	loaded, err := LoadPublicKeyFromPEM(pemBytes)
	if err != nil {
		t.Fatalf("load PEM: %v", err)
	}
	if !pub.Equal(loaded) {
		t.Fatalf("loaded public key mismatch")
	}
}
