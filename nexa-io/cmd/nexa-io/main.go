package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"nexa-io/internal/logstream"
	"nexa-io/internal/proto"
	"nexa-io/internal/termstream"
	"nexa-io/internal/ticket"
)

func main() {
	mode := flag.String("mode", "", "Sidecar mode: verify-ticket | logs | terminal")
	pubKeyPath := flag.String("pubkey", "/etc/nexa/ticket-pub.pem", "Fallback path for Ed25519 ticket public key")
	ticketStr := flag.String("ticket", "", "Ticket string for --mode=verify-ticket walking skeleton")
	scope := flag.String("scope", "logs", "Expected ticket scope for --mode=verify-ticket")
	unixSock := flag.String("unix-socket", "", "Optional Unix domain socket path when not using systemd LISTEN_FDS")
	listenAddr := flag.String("listen", "127.0.0.1:3091", "Fallback TCP listen address when not using systemd LISTEN_FDS")
	pm2Out := flag.String("pm2-out", logstream.DefaultPM2OutPath, "Optional PM2 stdout log path during transition phase")
	pm2Err := flag.String("pm2-err", logstream.DefaultPM2ErrPath, "Optional PM2 stderr log path during transition phase")
	enableTerminal := flag.Bool("enable-terminal", false, "Explicitly enable inspection terminal (kill switch default OFF, FR-TERM-18)")
	enableFlagFile := flag.String("terminal-flag-file", termstream.DefaultKillSwitchFile, "Optional flag file path enabling terminal kill switch")
	shellPath := flag.String("shell", "/bin/bash", "Login shell binary for --mode=terminal")
	termHome := flag.String("term-home", "/var/lib/nexa-term", "Isolated HOME directory for nexa-term (StateDirectory)")
	termUser := flag.String("term-user", "nexa-term", "Unprivileged user name for clean shell env")
	flag.Parse()

	switch *mode {
	case "verify-ticket":
		pub, err := ticket.LoadPublicKeyFromCredential("ticket-pub.pem", *pubKeyPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR load pubkey: %v\n", err)
			os.Exit(1)
		}
		v, err := ticket.NewVerifier(pub)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR init verifier: %v\n", err)
			os.Exit(1)
		}
		claims, err := v.Verify(*ticketStr, *scope)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR verify: %v\n", err)
			os.Exit(2)
		}
		fmt.Printf("OK dev=%s scope=%s sid=%s jti=%s exp=%d\n",
			claims.Dev, claims.Scope, claims.SID, claims.JTI, claims.Exp)

	case "logs":
		pub, err := ticket.LoadPublicKeyFromCredential("ticket-pub.pem", *pubKeyPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR load ticket-pub.pem for logs mode: %v\n", err)
			os.Exit(1)
		}
		v, err := ticket.NewVerifier(pub)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR init ticket verifier: %v\n", err)
			os.Exit(1)
		}

		ln, err := logstream.ResolveListener(*unixSock, *listenAddr)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR resolve logstream listener: %v\n", err)
			os.Exit(1)
		}

		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
		defer stop()

		var httpSrv *http.Server
		shutdown := func(reason string) {
			fmt.Fprintf(os.Stderr, "[nexa-log] Shutting down cleanly (%s)...\n", reason)
			stop()
			if httpSrv != nil {
				sCtx, sCancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer sCancel()
				_ = httpSrv.Shutdown(sCtx)
			}
		}

		logSrv := logstream.NewServer(logstream.Config{
			Verifier:      v,
			BatchInterval: 150 * time.Millisecond,
			PauseTimeout:  5 * time.Minute,
			IdleTimeout:   90 * time.Second,
			PM2OutLogPath: *pm2Out,
			PM2ErrLogPath: *pm2Err,
			OnIdleShutdown: func() {
				shutdown("idle > 90s with 0 active connections, FR-SRV-02")
			},
		})

		mux := http.NewServeMux()
		mux.Handle("/io/logs", logSrv)
		mux.Handle("/", logSrv)

		httpSrv = &http.Server{
			Handler:           mux,
			ReadHeaderTimeout: 10 * time.Second,
		}

		go func() {
			<-ctx.Done()
			sCtx, sCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer sCancel()
			_ = httpSrv.Shutdown(sCtx)
		}()

		go logSrv.StartIdleWatchdog(ctx)
		if err := httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "ERR nexa-log serve: %v\n", err)
			os.Exit(1)
		}

	case "terminal":
		pub, err := ticket.LoadPublicKeyFromCredential("ticket-pub.pem", *pubKeyPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR load ticket-pub.pem for terminal mode: %v\n", err)
			os.Exit(1)
		}
		v, err := ticket.NewVerifier(pub)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR init ticket verifier: %v\n", err)
			os.Exit(1)
		}

		ln, err := logstream.ResolveListener(*unixSock, *listenAddr)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERR resolve terminal listener: %v\n", err)
			os.Exit(1)
		}

		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
		defer stop()

		var httpSrv *http.Server
		var termSrv *termstream.Server

		shutdown := func(reason string) {
			fmt.Fprintf(os.Stderr, "[nexa-term] Shutting down cleanly (%s)...\n", reason)
			stop()
			if termSrv != nil {
				termSrv.ShutdownAll(proto.CloseServerStop)
			}
			if httpSrv != nil {
				sCtx, sCancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer sCancel()
				_ = httpSrv.Shutdown(sCtx)
			}
		}

		termSrv = termstream.NewServer(termstream.Config{
			Verifier:          v,
			Enabled:           *enableTerminal,
			EnableFlagFile:    *enableFlagFile,
			DetachTimeout:     30 * time.Second,
			GraceTimeout:      120 * time.Second,
			MaxSessionAge:     4 * time.Hour,
			IdleTimeout:       90 * time.Second,
			MaxGlobalSessions: 2,
			ShellPath:         *shellPath,
			HomeDir:           *termHome,
			UserName:          *termUser,
			OnIdleShutdown: func() {
				shutdown("idle > 90s with 0 active sessions, FR-SRV-02")
			},
		})

		mux := http.NewServeMux()
		mux.Handle("/io/term", termSrv)
		mux.Handle("/", termSrv)

		httpSrv = &http.Server{
			Handler:           mux,
			ReadHeaderTimeout: 10 * time.Second,
		}

		go func() {
			<-ctx.Done()
			termSrv.ShutdownAll(proto.CloseServerStop)
			sCtx, sCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer sCancel()
			_ = httpSrv.Shutdown(sCtx)
		}()

		go termSrv.StartIdleWatchdog(ctx)
		if err := httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "ERR nexa-term serve: %v\n", err)
			os.Exit(1)
		}

	default:
		fmt.Fprintln(os.Stderr, "Usage: nexa-io --mode=verify-ticket|logs|terminal")
		os.Exit(1)
	}
}
