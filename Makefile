BUILD_DIR = ./dist
SRC_DIR = ./src
NODE_MODULES = ./node_modules
SRC_FILES := $(shell find $(SRC_DIR) -type f)
BREAKDOWN_PERIOD ?= "yesterday"

.PHONY: all install build run

all: build

$(NODE_MODULES):
	pnpm install

install: $(NODE_MODULES)

$(BUILD_DIR): $(SRC_FILES) $(NODE_MODULES)
	pnpm build

build: $(BUILD_DIR)

run: build
	node ./bin/index.js --profile "${AWS_PROFILE}" --access-key "${ACCESS_KEY}" --secret-key "${SECRET_KEY}" --role-arn "${ROLE_ARN}" --region "${AWS_REGION}" -S "${SLACK_TOKEN_AWS_COST_CLI}" -C "${SLACK_CHANNEL_ID}" --breakdown-period "${BREAKDOWN_PERIOD}"

test:
	pnpm test

lint:
	pnpm lint

format:
	pnpm format

version:
	pnpm exec node $(BUILD_DIR)/index.js --version
