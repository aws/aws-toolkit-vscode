/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ecsNodes from '../../../awsexplorer/nodes/ecsNodeInterfaces'
import { RegionInfo } from '../../../shared/regions/regionInfo'
import { AWSTreeErrorHandlerNode } from '../../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { RegionNode } from '../../../shared/treeview/nodes/regionNode'

export class MockRegionNode implements RegionNode {
    public regionCode = 'us-weast-1'
    public regionName = 'that says "west", Patrick'
    public constructor() {}
    public update(info: RegionInfo) { return undefined }
    public async getChildren() { return [] }
}

export class MockEcsNode extends AWSTreeNodeBase implements ecsNodes.EcsNode {

    public parent = new MockRegionNode()

    public regionCode = 'us-weast-1'

    public constructor () {
        super('mock ecs')
    }

    public async getChildren() { return [] }

    public async update() {}
}

export class MockClustersNode extends AWSTreeErrorHandlerNode implements ecsNodes.EcsClustersNode {

    public parent = new MockEcsNode()

    public regionCode = 'us-weast-1'

    public constructor() {
        super('mock clusters')
    }

    public async updateChildren() {}

    public async getChildren() { return [] }
}

export class MockClusterNode extends AWSTreeErrorHandlerNode implements ecsNodes.EcsClusterNode {

    public parent = new MockClustersNode()

    public regionCode = 'us-weast-1'

    public arn = 'arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster'

    public constructor() {
        super('my-cluster')
    }

    public async update() {}

    public async getChildren() { return [] }
}

export class MockServicesNode extends AWSTreeErrorHandlerNode implements ecsNodes.EcsClusterServicesNode {

    public parent = new MockClusterNode()

    public regionCode = 'us-weast-1'

    public constructor() {
        super('mock services')
    }

    public async updateChildren() {}

    public async getChildren() { return [] }
}

export class MockTaskDefinitionsNode extends AWSTreeErrorHandlerNode implements ecsNodes.EcsTaskDefinitionsNode {

    public parent = new MockEcsNode()

    public regionCode = 'us-weast-1'

    public constructor() {
        super('mock clusters')
    }

    public async updateChildren() {}

    public async getChildren() { return [] }
}
