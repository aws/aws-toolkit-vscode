/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import xml2js = require('xml2js')
import { ext } from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import { CompositeResourceFetcher } from '../../shared/resourcefetcher/compositeResourceFetcher'
import { FileResourceFetcher } from '../../shared/resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import { ResourceFetcher } from '../../shared/resourcefetcher/resourcefetcher'
import { sampleRequestManifestPath } from '../constants'

interface SampleRequest {
    name: string | undefined
    filename: string | undefined
}

interface SampleRequestManifest {
    requests: {
        request: SampleRequest[]
    }
}

export async function getSampleLambdaPayloads(): Promise<SampleRequest[]> {
    const logger = getLogger()
    const sampleInput = await makeSampleRequestManifestResourceFetcher().get()

    if (!sampleInput) {
        throw new Error('Unable to retrieve Sample Request manifest')
    }

    logger.debug(`Loaded: ${sampleInput}`)

    const inputs: SampleRequest[] = []

    xml2js.parseString(sampleInput, { explicitArray: false }, (err: Error, result: SampleRequestManifest) => {
        if (err) {
            return
        }

        inputs.push(...result.requests.request)
    })

    return inputs
}

function makeSampleRequestManifestResourceFetcher(): ResourceFetcher {
    return new CompositeResourceFetcher(
        new HttpResourceFetcher(sampleRequestManifestPath, { showUrl: true }),
        new FileResourceFetcher(ext.manifestPaths.lambdaSampleRequests)
    )
}
