// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

abstract class ChangeLogWriter(issueUrl: String? = null) {
    private val issueUrl = issueUrl?.trimEnd('/')?.plus("/")

    open fun writeLine(line: String) {
        append(expandIssueLinks(line))
    }

    protected abstract fun append(line: String)
    abstract fun close()

    /**
     * Expands GitHub Issue numbers to markdown URL and returns the updated entry
     */
    private fun expandIssueLinks(entry: String): String {
        if (issueUrl == null) {
            return entry
        }

        val regex = """#(\d+)""".toRegex()
        return regex.replace(entry) {
            val issue = it.groups[1]?.value ?: return@replace it.value
            "[#$issue]($issueUrl$issue)"
        }
    }
}
