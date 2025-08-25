#!/usr/bin/env bash
set -euxo pipefail

SCRIPT_DIR=$(dirname "${0}")
SCRIPT_DIR=$(cd "${SCRIPT_DIR}"; pwd)
SRC_DIR=$(cd "${SCRIPT_DIR}"; cd ..; pwd)
PACKAGE_DIR="${SRC_DIR}/dist"

cd "${SRC_DIR}"

npm install
npm test
npx tsc
npm pack

cp -v "${SCRIPT_DIR}/package.npmrc" "${PACKAGE_DIR}/.npmrc"

case "${BUILDKITE_BRANCH}" in
main) DRY_RUN=;;
*) DRY_RUN="--dry-run";;
esac

# TODO: set up secret for CI
echo npx google-artifactregistry-auth --repo-config="${PACKAGE_DIR}/.npmrc" --credential-config="${HOME}/.npmrc"

# TODO: get this to actually work
(cd ${PACKAGE_DIR} && echo npm publish ${DRY_RUN})

