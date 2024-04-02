#!/bin/bash

# Ensure the script fails on errors
set -e

# Check if the correct number of arguments are passed
if [ "$#" -ne 4 ]; then
  echo "Usage: $0 <destination_directory> <release_tag> <grade> <source_dir>"
  exit 1
fi

# Assign arguments to variables
DESTINATION_DIR="$1"
RELEASE_TAG="$2"
GRADE="$3"
SOURCE_DIR="$4"

# Ensure the destination directory exists
mkdir -p "${DESTINATION_DIR}/snap"

# Extract version from RELEASE_TAG, assuming it's in the format "vX.Y.Z"
VERSION="${RELEASE_TAG#v}"

# Create the snapcraft.yaml file
cat > "${DESTINATION_DIR}/snap/snapcraft.yaml" <<EOF
name: algokit-explorer
base: core22
version: "$VERSION"
summary: Short description of algokit-explorer.
description: |
  Detailed description of algokit-explorer.

confinement: classic
grade: $GRADE

parts:
  algokit-explorer:
    source: "$SOURCE_DIR"
    plugin: dump
    stage:
      - icons
      - algokit-explorer
      - algokit-explorer.desktop
    prime:
      - icons
      - algokit-explorer
      - algokit-explorer.desktop
    stage-packages:
      - libgtk-3-0
      - libwebkit2gtk-4.0-37

apps:
  algokit-explorer:
    command: algokit-explorer
    plugs:
      - desktop
      - desktop-legacy
      - home
      - x11
      - wayland
      - network
      - network-bind
EOF

echo "snapcraft.yaml has been created at ${DESTINATION_DIR}/snap/snapcraft.yaml"
