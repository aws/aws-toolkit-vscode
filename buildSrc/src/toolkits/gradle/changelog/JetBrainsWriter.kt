// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import org.commonmark.node.AbstractVisitor
import org.commonmark.node.Heading
import org.commonmark.parser.Parser
import org.commonmark.renderer.html.HtmlRenderer
import java.io.File
import java.lang.Math.max
import java.lang.Math.min

class JetBrainsWriter(private val changeNotesFile: File, issueUrl: String? = null) : ChangeLogWriter(issueUrl) {
    private val sb = StringBuilder()

    override fun append(line: String) {
        sb.append(line)
    }

    override fun close() {
        val renderer = HtmlRenderer.builder()
            .softbreak("<br/>")
            .build()
        val parser = Parser.builder()
            .postProcessor {
                it.accept(object : AbstractVisitor() {
                    override fun visit(heading: Heading) {
                        heading.level = max(1, min(heading.level + 2, 6))
                    }
                })

                it
            }
            .build()
        val htmlVersionError = renderer.render(parser.parse(sb.toString()))

        changeNotesFile.writeText("""
            <idea-plugin>
                <change-notes>
                <![CDATA[
                    $htmlVersionError
                ]]>
                </change-notes>
            </idea-plugin>
        """.trimIndent())
    }

    override fun toString(): String = "JetBrainsWriter(file=$changeNotesFile)"
}
