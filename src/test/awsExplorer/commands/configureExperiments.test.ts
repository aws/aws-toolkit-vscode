/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {
    Experiment,
    ExperimentConfig,
    ExperimentMetadata,
    getExperiments,
    updateExperiments,
} from '../../../shared/experiments/experiments'

describe('configureExperiments', function () {
    let sandbox: sinon.SinonSandbox

    // These tests operate against the user's configuration.
    // Restore the initial value after testing is complete.
    let originalExperimentsValue: any
    let settings: vscode.WorkspaceConfiguration

    const FAKE_METADATA: ExperimentMetadata = {
        id: 'Foo',
        description: 'Bar',
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        settings = vscode.workspace.getConfiguration('aws')
        originalExperimentsValue = settings.get('experiments')
    })

    afterEach(async function () {
        sandbox.restore()
        await settings.update('experiments', originalExperimentsValue, vscode.ConfigurationTarget.Global)
    })

    it('reads experiment metadata', function () {
        const experiments = getExperiments([FAKE_METADATA])

        assert.strictEqual(experiments.size, 1)
        assert.strictEqual(experiments.has('Foo'), true)
        assert.deepStrictEqual(experiments.get('Foo'), getExperiment(false))
    })

    it('reads enablement config', async function () {
        const config: ExperimentConfig = {
            Foo: true,
        }
        await vscode.workspace.getConfiguration().update('aws.experiments', config, vscode.ConfigurationTarget.Global)

        const experiments = getExperiments([FAKE_METADATA])
        assert.deepStrictEqual(experiments.get('Foo'), getExperiment(true))
    })

    it('updates experiment config', async function () {
        await updateExperiments([getExperiment(true)])
        const config = vscode.workspace.getConfiguration('aws').get<ExperimentConfig>('experiments')
        if (!config) {
            assert.fail('unable to read config')
        }
        assert.strictEqual(config['Foo'], true)
    })

    function getExperiment(enabled: boolean): Experiment {
        return {
            ...FAKE_METADATA,
            enabled,
        }
    }
})
