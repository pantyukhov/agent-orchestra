APP_NAME := agent-orchestra
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

.PHONY: build test clean run install claude

build:
	go build -ldflags "-X main.version=$(VERSION)" -o $(APP_NAME) ./cmd/agent-orchestra

test:
	go test -v -race ./...

clean:
	rm -f $(APP_NAME)

run: build
	./$(APP_NAME) -config example/example.yaml

install: build
	install -m 755 $(APP_NAME) $(shell go env GOPATH)/bin/

claude:
	claude --dangerously-skip-permissions
