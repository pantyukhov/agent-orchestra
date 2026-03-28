package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
	"github.com/pavelpantiukhov/agent-orchestra/internal/pipeline"
)

var version = "dev"

func main() {
	configPath := flag.String("config", "pipeline.yaml", "path to pipeline config file")
	showVersion := flag.Bool("version", false, "show version")
	flag.Parse()

	if *showVersion {
		fmt.Println("agent-orchestra", version)
		return
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	logger.Info("loaded pipeline", "name", cfg.Pipeline.Name, "steps", len(cfg.Pipeline.Steps), "loop_count", cfg.Pipeline.Loop.Count)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	p := pipeline.New(&cfg.Pipeline, logger)
	if err := p.Run(ctx); err != nil {
		if errors.Is(err, context.Canceled) {
			logger.Info("pipeline interrupted by signal")
			os.Exit(130)
		}
		logger.Error("pipeline failed", "error", err)
		os.Exit(1)
	}

	logger.Info("pipeline finished successfully")
}
