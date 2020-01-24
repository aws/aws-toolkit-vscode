/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
export namespace cdk {
    export namespace iconPaths {
        export const dark: IconPaths = makeIconPathsObject()
        export const light: IconPaths = makeIconPathsObject()
    }
}

export interface IconPaths {
    cdk: string
    cloudFormation: string
}

function makeIconPathsObject(): IconPaths {
    return {
        cdk: '',
        cloudFormation: ''
    }
}
