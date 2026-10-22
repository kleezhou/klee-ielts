#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist_root="$project_root/dist"

rm -rf "$dist_root"
mkdir -p "$dist_root/server" "$dist_root/.openai"
cp "$project_root/worker/index.js" "$dist_root/server/index.js"
manifest="$project_root/.openai/hosting.json"
if [[ ! -f "$manifest" ]]; then manifest="$project_root/.openai/hosting.example.json"; fi
cp "$manifest" "$dist_root/.openai/hosting.json"

echo "Built $dist_root"
