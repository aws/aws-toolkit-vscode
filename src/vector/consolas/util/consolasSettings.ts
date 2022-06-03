/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Experiments, fromExtensionManifest } from '../../../shared/settings'

const description = {
    includeSuggestionsWithCodeReferences: Boolean,
    doNotSendConsolasServiceMetrics: Boolean,
}
export class ConsolasSettings extends fromExtensionManifest('aws.consolas', description) {
    public async isEnabled(): Promise<boolean> {
        return await Experiments.instance.isExperimentEnabled('Consolas')
    }

    public isIncludeSuggestionsWithCodeReferencesEnabled(): boolean {
        return this.get(`includeSuggestionsWithCodeReferences`, false)
    }

    public isOptoutEnabled(): boolean {
        return this.get('doNotSendConsolasServiceMetrics', false)
    }

    static #instance: ConsolasSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
