// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle

import org.commonmark.parser.Parser
import org.commonmark.renderer.html.HtmlRenderer
import java.io.File

class JetBrainsWriter(private val changeNotesFile: File, issueUrl: String? = null) : ChangeLogWriter {
    private val issueUrl = issueUrl?.trimEnd('/')?.plus("/")
    private val sb = StringBuilder()
    private val renderer = HtmlRenderer.builder().softbreak("<br/>") .build()
    private val parser = Parser.builder().build()

    override fun write(entry: ReleaseEntry) {
        sb.appendln("<p>${entry.version}:<br/>")
        sb.appendln("<ul>")
        entry.entries.forEach { writeEntry(it) }
        sb.appendln("</ul></p>")
    }

    private fun writeEntry(entry: Entry) {
        val document = parser.parse(entry.description)
        val markdown = renderer.render(document).replace("<p>", "").replace("</p>", "<br/>").let {
            if (issueUrl != null) {
                expandIssueLinks(it, issueUrl)
            } else {
                it
            }
        }

        sb.appendln("  <li><strong>(${entry.type.sectionTitle})</strong> $markdown</li>")
    }

    private fun expandIssueLinks(entry: String, issueUrl: String): String {
        val regex = """#(\d+)(?=<|\s)""".toRegex()
        return regex.replace(entry) {
            val issue = it.groups[1]?.value ?: return@replace it.value
            """<a href="$issueUrl$issue">#$issue</a>"""
        }
    }

    override fun flush() {
        changeNotesFile.writeText("""
            <idea-plugin>
                <change-notes>
                <![CDATA[
                    $sb
                ]]>
                </change-notes>
            </idea-plugin>
        """.trimIndent())
    }
}