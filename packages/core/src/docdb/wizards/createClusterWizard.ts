/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCommonButtons } from '../../shared/ui/buttons'
import { createExitPrompter } from '../../shared/ui/common/exitPrompter'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Wizard, WizardOptions } from '../../shared/wizards/wizard'
import { RegionalClusterConfiguration, RegionalClusterWizard } from './regionalClusterWizard'
import { ElasticClusterConfiguration, ElasticClusterWizard } from './elasticClusterWizard'
import { DocumentDBClient } from '../../shared/clients/docdbClient'

const DocDBClusterHelpUrl =
    'https://docs.aws.amazon.com/documentdb/latest/developerguide/docdb-using-elastic-clusters.html'

type ClusterType = 'regional' | 'elastic' | undefined

export interface CreateClusterState {
    ClusterType: ClusterType
    readonly RegionalCluster: RegionalClusterConfiguration
    readonly ElasticCluster: ElasticClusterConfiguration
}

/**
 * A wizard to prompt configuration of a new cluster
 */
export class CreateClusterWizard extends Wizard<CreateClusterState> {
    title: string
    constructor(
        readonly client: DocumentDBClient,
        options: WizardOptions<CreateClusterState> = {}
    ) {
        super({
            initState: options.initState,
            implicitState: options.implicitState,
            exitPrompterProvider: createExitPrompter,
        })
        this.title = localize('AWS.docdb.createCluster.title', 'Create DocumentDB Cluster')
    }

    public override async init(): Promise<this> {
        this.form.ClusterType.bindPrompter(() => createClusterTypePrompter())

        const regionalClusterWizard = await new RegionalClusterWizard(this.client, this.title).init()
        this.form.RegionalCluster.applyBoundForm(regionalClusterWizard.boundForm, {
            showWhen: (state) => state.ClusterType === 'regional',
        })

        const elasticClusterWizard = new ElasticClusterWizard(this.client, this.title)
        this.form.ElasticCluster.applyBoundForm(elasticClusterWizard.boundForm, {
            showWhen: (state) => state.ClusterType === 'elastic',
        })

        return this
    }
}

function createClusterTypePrompter() {
    const regionalType: DataQuickPickItem<ClusterType> = {
        data: 'regional',
        label: localize('AWS.docdb.createCluster.clusterType.regional.label', 'Instance Based Cluster'),
        detail: localize(
            'AWS.docdb.createCluster.clusterType.regional.detail',
            'Instance based cluster can scale your database to millions of reads per second and up to 128 TiB of storage capacity. With instance based clusters you can choose your instance type based on your requirements.'
        ),
    }
    const elasticType: DataQuickPickItem<ClusterType> = {
        data: 'elastic',
        label: localize('AWS.docdb.createCluster.clusterType.elastic.label', 'Elastic Cluster'),
        detail: localize(
            'AWS.docdb.createCluster.clusterType.elastic.detail',
            'Elastic clusters can scale your database to millions of reads and writes per second, with petabytes of storage capacity. Elastic clusters support MongoDB compatible sharding APIs. With Elastic Clusters, you do not need to choose, manage or upgrade instances.'
        ),
    }

    return createQuickPick([regionalType, elasticType], {
        title: localize('AWS.docdb.createCluster.clusterType.prompt', 'Cluster type'),
        buttons: createCommonButtons(DocDBClusterHelpUrl),
    })
}
