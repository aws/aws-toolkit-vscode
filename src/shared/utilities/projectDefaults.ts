/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import { mkdir, writeFile } from '../filesystem'
import { fileExists } from '../filesystemUtilities'

export interface SamDeployDefaults {
    region?: string
    s3BucketName?: string
    stackName?: string
}

export interface AllDefaults {
    samDeploy: {
        [samTemplatePath: string]: SamDeployDefaults
    }
}

export interface ProjectDefaultsManager {
    readonly filePath: string
    refresh(): void
    getAllDefaults(): AllDefaults
    save(): Promise<void>
    setSamDeployDefaults(params: SamDeployDefaults): Promise<void>
    getSamDeployDefaults(): SamDeployDefaults | undefined
}

export function makeProjectDefaultsManager({samTemplatePath}: {
    samTemplatePath: string
}): ProjectDefaultsManager {
    let allDefaults: AllDefaults
    const samProjectDir = path.dirname(samTemplatePath)
    const filePath = path.resolve(samProjectDir, '.aws-toolkit-vscode/user-prefs.json')
    const prefsDir = path.dirname(filePath)
    const save = async () => {
        if (!await fileExists(prefsDir)) {
            await mkdir(prefsDir)
        }
        await writeFile(filePath, JSON.stringify(allDefaults, undefined, 2) )
    }

    const getAllDefaults = (): AllDefaults => { // Mostly for testing
        return Object.freeze(allDefaults)
    }

    const getSamDeployDefaults = (): SamDeployDefaults | undefined => {
        return allDefaults.samDeploy[samTemplatePath]
    }

    const setSamDeployDefaults = async (params: SamDeployDefaults) => {
        const priorDefaults = getSamDeployDefaults()
        const mergedParams: SamDeployDefaults = {
            ...priorDefaults,
            ...params
        }
        if (JSON.stringify(mergedParams) !== JSON.stringify(priorDefaults)) {
            allDefaults.samDeploy[samTemplatePath] = mergedParams
            await save()
        }
    }

    const refresh = () => {
        try {
            allDefaults = require(filePath) as AllDefaults
        } catch (err) {
            allDefaults = {
                samDeploy: {}
            }
        }
    }
    const mgr: ProjectDefaultsManager = {
        filePath,
        getAllDefaults,
        getSamDeployDefaults,
        setSamDeployDefaults,
        refresh,
        save,
    }
    mgr.refresh() // initialize from persistent store

    return mgr
}
