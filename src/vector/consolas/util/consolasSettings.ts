/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Experiments, fromExtensionManifest } from '../../../shared/settings'

const description = {
    includeSuggestionsWithCodeReferences: Boolean,
    dataCollection: Boolean,
}
export class ConsolasSettings extends fromExtensionManifest('aws.consolas', description) {
    public async isEnabled(): Promise<boolean> {
        return await Experiments.instance.isExperimentEnabled('Consolas')
    }

    public isIncludeSuggestionsWithCodeReferencesEnabled(): boolean {
        return this.get(`includeSuggestionsWithCodeReferences`, false)
    }

    public isdataCollectionEnabled(): boolean {
        return this.get('dataCollection', true)
    }

    static #instance: ConsolasSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
