#!/usr/bin/env bash
THIS_SCRIPT=$(basename "${0}")
#SCRIPT_DIR=$(DIR=$(dirname "${0}") && cd "${DIR}" && pwd)
#PATH=${PATH}:${SCRIPT_DIR}

function error() {
    echo "$*" 1>&2
    exit 1
}

if ! (which gltf-pipeline 2>&1) > /dev/null; then
  error "npm install -g gltf-pipeline first." 1>&2
fi

if [[ ! -f "${1}" || "${1}" != *.glb ]]; then
  error "usage: ${THIS_SCRIPT} <input.glb>" 1>&2
fi

GLB=${1}
GLTF_DIR=${GLB%.glb}
GLTF_NAME=$(basename "${GLTF_DIR}").gltf
GLTF=${GLTF_DIR}/${GLTF_NAME}

[[ ! -d "${GLTF_DIR}" ]] || error "${GLTF_DIR} already exists."

echo "exploding ${GLB} into ${GLTF}"
mkdir "${GLTF_DIR}"
exec gltf-pipeline --input="${GLB}" --output="${GLTF}" --separate
