// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.Constraints
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.impl.DynamicActionConfigurationCustomizer

class RebuildActionConfigurationCustomizer : DynamicActionConfigurationCustomizer {
    private var cawsAction: Pair<DefaultActionGroup, AnAction>? = null

    override fun registerActions(actionManager: ActionManager) {
        val actionGroup = (
            actionManager.getAction(REBUILD_ACTION_ACTION_GROUP_NAME)
                // TODO: should only need the first one
                ?: actionManager.getAction("UnattendedHostDropdownGroup")
            ) as? DefaultActionGroup

        actionGroup?.let {
            val rebuildAction = actionManager.getAction("aws.caws.rebuildAction") ?: return
            it.addAction(rebuildAction, Constraints.FIRST, actionManager)
            cawsAction = actionGroup to rebuildAction
        }
    }

    override fun unregisterActions(actionManager: ActionManager) {
        cawsAction?.let { (group, action) ->
            group.remove(action, actionManager)
        }
    }
}
