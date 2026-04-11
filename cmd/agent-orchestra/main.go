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

	"path/filepath"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
	"github.com/pavelpantiukhov/agent-orchestra/internal/history"
	"github.com/pavelpantiukhov/agent-orchestra/internal/orchestrator"
	"github.com/pavelpantiukhov/agent-orchestra/internal/pipeline"
)

var version = "dev"

func main() {
	configPath := flag.String("config", "pipeline.yaml", "path to pipeline config file")
	showVersion := flag.Bool("version", false, "show version")
	once := flag.Bool("once", false, "run once and exit (orchestrator mode)")
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

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	switch cfg.Mode() {
	case "orchestrator":
		logger.Info("loaded orchestrator config", "name", cfg.Orchestrator.Name,
			"triggers", len(cfg.Orchestrator.Triggers),
			"pipelines", len(cfg.Orchestrator.Pipelines))

		o := orchestrator.New(cfg.Orchestrator, logger)

		if *once {
			if err := o.RunOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("orchestrator failed", "error", err)
				os.Exit(1)
			}
		} else {
			if err := o.Run(ctx); err != nil {
				if errors.Is(err, context.Canceled) {
					logger.Info("orchestrator interrupted by signal")
					os.Exit(130)
				}
				logger.Error("orchestrator failed", "error", err)
				os.Exit(1)
			}
		}

	case "pipeline":
		logger.Info("loaded pipeline", "name", cfg.Pipeline.Name,
			"steps", len(cfg.Pipeline.Steps),
			"loop_count", cfg.Pipeline.Loop.Count)

		p := pipeline.NewFromConfig(cfg.Pipeline, logger)
		// Set up history store next to the config file
		historyDir := filepath.Join(filepath.Dir(*configPath), ".history")
		p.History = history.NewStore(historyDir)
		p.ConfigPath = *configPath
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
}
