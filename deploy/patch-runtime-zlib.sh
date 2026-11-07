#!/bin/sh
set -eu

# Replace only the vulnerable zlib in the pinned Alpine 3.24 amd64 runtimes.
# Alpine's installed signing keys must also accept the checksum-pinned APK.
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
cd "$workdir"
package=zlib-1.4-r0.apk
wget -q "https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/$package"
printf '%s  %s\n' '7b05bc778b8b25cd880835b40114182bd4d1581717504d0129c810c0a14291cb' "$package" | sha256sum -c -
apk add --no-cache "./$package"
