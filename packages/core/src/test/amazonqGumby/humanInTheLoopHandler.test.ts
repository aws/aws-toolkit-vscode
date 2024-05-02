/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { parseVersionsListFromPomFile } from '../../codewhisperer/service/transformByQ/transformFileHandler'
import {
    findDownloadArtifactStep,
    getArtifactsFromProgressUpdate,
} from '../../codewhisperer/service/transformByQ/transformApiHandler'
import { fsCommon } from '../../srcShared/fs'
import {
    downloadArtifactIdFixture,
    downloadArtifactTypeFixture,
    transformationStepsHumanInTheLoopFixture,
} from './resources/mocks/transformFixtures'
import { getTestResourceFilePath } from './amazonQGumbyUtil'

describe('Amazon Q Gumby Human In The Loop Handler', function () {
    describe('parseXmlDependenciesReport', function () {
        it('Will return parsed values', async function () {
            const testXmlReport = await fsCommon.readFileAsString(
                getTestResourceFilePath('resources/files/humanInTheLoop/dependency-updates-aggregate-report.xml')
            )
            const { latestVersion, majorVersions, minorVersions, status } = await parseVersionsListFromPomFile(
                testXmlReport
            )

            assert.strictEqual(latestVersion, '1.18.32')
            assert.strictEqual(minorVersions[0], '0.12.0')
            assert.strictEqual(majorVersions[0], '1.12.2')
            assert.strictEqual(status, 'incremental available')
        })
    })
    describe('getArtifactIdentifiers', function () {
        it('will return downloaded artifact values from transformationStep', function () {
            const transformationStepsFixture = transformationStepsHumanInTheLoopFixture?.[0]?.progressUpdates?.[0]
            const { artifactId, artifactType } = getArtifactsFromProgressUpdate(transformationStepsFixture)

            assert.strictEqual(artifactId, downloadArtifactIdFixture)
            assert.strictEqual(artifactType, downloadArtifactTypeFixture)
        })
    })
    describe('findDownloadArtifactStep', function () {
        it('will return downloaded artifact values from transformationStep', function () {
            const { transformationStep, progressUpdate } = findDownloadArtifactStep(
                transformationStepsHumanInTheLoopFixture
            )
            assert.strictEqual(transformationStep, transformationStepsHumanInTheLoopFixture[0])
            assert.strictEqual(progressUpdate, transformationStepsHumanInTheLoopFixture[0].progressUpdates?.[0])
        })
        it('will return undefined if no downloadArtifactId found', function () {
            const transformationStepsFixture = transformationStepsHumanInTheLoopFixture
            delete transformationStepsFixture?.[0]?.progressUpdates?.[0]?.downloadArtifacts
            const { transformationStep, progressUpdate } = findDownloadArtifactStep(transformationStepsFixture)
            assert.strictEqual(transformationStep, undefined)
            assert.strictEqual(progressUpdate, undefined)
        })
    })
})
