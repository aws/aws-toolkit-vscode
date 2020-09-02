// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import java.util.Calendar

class QueryEditorSavedState {
    fun setQueryEditorState(queryDetails: QueryDetails, enabledComponentsDisabledComponents: EnabledComponentsState) {
        currentQueryEditorState = queryDetails
        enabledDisabledOptionsState = enabledComponentsDisabledComponents
    }

    fun getQueryEditorState(): QueryDetails = currentQueryEditorState

    fun getEnabledDisabledOptionsState(): EnabledComponentsState = enabledDisabledOptionsState

    companion object {
        var currentQueryEditorState = QueryDetails(
            listOf("Default log"),
            false,
            Calendar.getInstance().time,
            Calendar.getInstance().time,
            true,
            "Minutes",
            "10",
            true,
            "Error",
            false,
            "fields @timestamp, @message\n" +
                "| sort @timestamp desc\n" +
                "| limit 20"
        )
        var enabledDisabledOptionsState = EnabledComponentsState(
            startDateEnabled = false,
            endDateEnabled = false,
            relativeTimeNumberEnabled = true,
            relativeTimeUnitEnabled = true,
            querySearchTermEnabled = true,
            queryBoxEnabled = false
        )
    }
}
