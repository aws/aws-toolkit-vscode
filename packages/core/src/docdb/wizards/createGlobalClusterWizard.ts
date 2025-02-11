/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import { DocDBEngine, DocumentDBClient } from '../../shared/clients/docdbClient'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Wizard, WizardOptions } from '../../shared/wizards/wizard'
import { validateClusterName } from '../utils'
import { RegionalClusterConfiguration, RegionalClusterWizard } from './regionalClusterWizard'

const DocDBGlobalHelpUrl = 'https://docs.aws.amazon.com/documentdb/latest/developerguide/global-clusters.html'

export interface CreateGlobalClusterState {
    RegionCode: string
    GlobalClusterName: string
    readonly Cluster: RegionalClusterConfiguration
}

/**
 * A wizard to prompt configuration of a new global cluster
 */
export class CreateGlobalClusterWizard extends Wizard<CreateGlobalClusterState> {
    constructor(
        readonly region: string,
        readonly engineVersion: string | undefined,
        readonly client: DocumentDBClient,
        options: WizardOptions<CreateGlobalClusterState> = {}
    ) {
        super({
            initState: options.initState,
            implicitState: options.implicitState,
            exitPrompterProvider: createExitPrompter,
        })
    }

    public override async init(): Promise<this> {
        this.form.RegionCode.bindPrompter(async () => {
            const regions = globals.regionProvider.getRegions().filter((r) => r.id !== this.region)
            return createRegionPrompter(regions, {
                serviceFilter: DocDBEngine,
                title: localize('AWS.docdb.addRegion.region.prompt', 'Secondary region'),
                helpUrl: DocDBGlobalHelpUrl,
            }).transform((region) => region.id)
        })

        this.form.GlobalClusterName.bindPrompter(
            () =>
                createInputBox({
                    title: localize('AWS.docdb.addRegion.name.title', 'Global Cluster Id'),
                    prompt: localize(
                        'AWS.docdb.addRegion.name.prompt',
                        'Specify a unique identifier for the global cluster'
                    ),
                    validateInput: validateClusterName,
                }),
            {
                showWhen: (state) => state.GlobalClusterName === undefined,
            }
        )

        const title = localize('AWS.docdb.addRegion.cluster.title', 'Secondary cluster')
        const regionalClusterWizard = await new RegionalClusterWizard(this.client, title, false, {
            initState: { EngineVersion: this.engineVersion },
        }).init()
        this.form.Cluster.applyBoundForm(regionalClusterWizard.boundForm)

        return this
    }
}
