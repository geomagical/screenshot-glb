#!/usr/bin/env bash
set -euxo pipefail

SCRIPT_DIR=$(dirname "${0}")
SCRIPT_DIR=$(cd "${SCRIPT_DIR}"; pwd)
SRC_DIR=$(cd "${SCRIPT_DIR}"; cd ..; pwd)
PACKAGE_DIR="${SRC_DIR}/dist"

cd "${SRC_DIR}"

npm install
npm run prepare
npm run test
npm run lint
npm run build
npm pack

cp -v "${SCRIPT_DIR}/package.npmrc" "${PACKAGE_DIR}/.npmrc"
sed \
  's:dist/cli.js:cli.js:g'  \
  "${SRC_DIR}/package.json" > "${PACKAGE_DIR}/package.json"

case "${BUILDKITE_BRANCH:-}" in
main) DRY_RUN=;;
*) DRY_RUN="--dry-run";;
esac

# create an empty .npmrc (must exist)
touch "${HOME}/.npmrc"
# generate the access token from 'ambient credentials' and add auth entry to .npmrc
npx google-artifactregistry-auth --repo-config="${PACKAGE_DIR}/.npmrc" --credential-config="${HOME}/.npmrc"

(cd ${PACKAGE_DIR} && npm publish ${DRY_RUN})
