// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.projectView.PresentationData
import com.intellij.openapi.extensions.ExtensionPointName
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode

/**
 * Processes AWS Explorer nodes after they are loaded from their primary source.
 *
 * This class is ran between the creation of the nodes, but before the nodes are shown on the UI.
 * Actions should be fast enough to not be detrimental to the loading times of the explorer tree.
 */
interface AwsExplorerNodeProcessor {
    companion object {
        val EP_NAME = ExtensionPointName<AwsExplorerNodeProcessor>("aws.toolkit.explorer.nodeProcessor")
    }

    /**
     * Runs after the [AwsExplorerNode.update] allowing for additional changes to its presentation.
     */
    fun postProcessPresentation(node: AwsExplorerNode<*>, presentation: PresentationData)
}
