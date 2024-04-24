// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.Node
import org.commonmark.parser.Parser
import org.commonmark.renderer.NodeRenderer
import org.commonmark.renderer.html.HtmlRenderer
import org.commonmark.renderer.html.HtmlWriter

fun convertMarkdownToHTML(markdown: String): String {
    val parser: Parser = Parser.builder().build()
    val document: Node = parser.parse(markdown)
    val htmlRenderer: HtmlRenderer = HtmlRenderer.builder().nodeRendererFactory { CodeBlockRenderer(it.writer) }.build()
    return htmlRenderer.render(document)
}

class CodeBlockRenderer(private val html: HtmlWriter) : NodeRenderer {
    override fun getNodeTypes(): Set<Class<out Node>> = setOf(FencedCodeBlock::class.java)
    override fun render(node: Node?) {
        val codeBlock = node as FencedCodeBlock
        val language = codeBlock.info

        html.line()
        html.tag("div", mapOf("class" to "code-block"))

        if (language == "diff") {
            codeBlock.literal.lines().forEach {
                when {
                    it.startsWith("-") -> html.tag("div", mapOf("class" to "deletion"))
                    it.startsWith("+") -> html.tag("div", mapOf("class" to "addition"))
                    it.startsWith("@@") -> html.tag("div", mapOf("class" to "meta"))
                    else -> html.tag("div")
                }
                html.tag("pre")
                html.text(it)
                html.tag("/pre")
                html.tag("/div")
            }
        } else {
            html.tag("pre")
            html.tag("code", mapOf("class" to "language-$language"))
            html.text(codeBlock.literal)
            html.tag("/code")
            html.tag("/pre")
        }

        html.tag("/div")
        html.line()
    }
}
