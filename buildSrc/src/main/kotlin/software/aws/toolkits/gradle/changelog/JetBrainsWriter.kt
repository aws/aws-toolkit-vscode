// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog

import org.commonmark.node.AbstractVisitor
import org.commonmark.node.Heading
import org.commonmark.parser.Parser
import org.commonmark.renderer.html.HtmlRenderer
import java.io.File
import java.lang.Math.max
import java.lang.Math.min

class JetBrainsWriter(private val changeNotesFile: File, repoUrl: String? = null) : ChangeLogWriter(repoUrl) {
    private val sb = StringBuilder()
    private var entryCount = 0

    override fun append(entry: String) {
        // if there are too many entries, we fail validation:
        // Invalid plugin descriptor 'plugin.xml'. The value of the '<change-notes>' parameter is too long. Its length is 65573 which is more than maximum 65535 characters long.
        // HtmlRenderer is not that flexible, so do the simple thing instead of trying to backtrack and maximize the size of the bundled changelog
        if (entryCount > 10) return
        if (++entryCount > 10) {
            // language=Markdown
            repoUrl?.let {
                sb.append("""
                    ----
                    Full plugin changelog available on [GitHub]($repoUrl/blob/main/CHANGELOG.md)
                """.trimIndent())
            }

            return
        }

        sb.append(entry)
    }

    override fun close() {
        val renderer = HtmlRenderer.builder()
            .softbreak("<br/>")
            .build()
        val parser = Parser.builder()
            .postProcessor {
                it.accept(
                    object : AbstractVisitor() {
                        override fun visit(heading: Heading) {
                            heading.level = max(1, min(heading.level + 2, 6))
                        }
                    }
                )

                it
            }
            .build()
        val htmlVersionError = renderer.render(parser.parse(sb.toString()))

        changeNotesFile.writeText(
            """
            <idea-plugin>
                <change-notes>
                <![CDATA[
                    $htmlVersionError
                ]]>
                </change-notes>
            </idea-plugin>
            """.trimIndent()
        )
    }

    override fun toString(): String = "JetBrainsWriter(file=$changeNotesFile)"
}
