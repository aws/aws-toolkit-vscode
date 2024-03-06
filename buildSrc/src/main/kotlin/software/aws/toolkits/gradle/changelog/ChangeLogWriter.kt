// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog

abstract class ChangeLogWriter(protected val repoUrl: String? = null) {
    private val issueUrl = repoUrl?.trimEnd('/')?.plus("issues/")

    open fun writeEntry(entry: String) {
        append(expandIssueLinks(entry))
    }

    protected abstract fun append(entry: String)
    abstract fun close()

    /**
     * Expands GitHub Issue numbers to markdown URL and returns the updated entry
     */
    private fun expandIssueLinks(entry: String): String {
        if (issueUrl == null) {
            return entry
        }

        val regex = "#(\\d+)".toRegex()
        return regex.replace(entry) {
            val issue = it.groups[1]?.value ?: return@replace it.value
            "[#$issue]($issueUrl$issue)"
        }
    }
}
