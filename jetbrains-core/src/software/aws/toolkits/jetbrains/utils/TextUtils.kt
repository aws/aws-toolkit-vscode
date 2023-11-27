// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.lang.Language
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.diff.impl.patch.PatchReader
import com.intellij.openapi.diff.impl.patch.TextFilePatch
import com.intellij.openapi.diff.impl.patch.apply.PlainSimplePatchApplier
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.text.StringUtil
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.codeStyle.CodeStyleManager
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.Node
import org.commonmark.parser.Parser
import org.commonmark.renderer.NodeRenderer
import org.commonmark.renderer.html.HtmlRenderer
import org.commonmark.renderer.html.HtmlWriter

fun formatText(project: Project, language: Language, content: String): String {
    var result = content
    CommandProcessor.getInstance().runUndoTransparentAction {
        PsiFileFactory.getInstance(project)
            .createFileFromText("foo.bar", language, content, false, true)?.let {
                result = CodeStyleManager.getInstance(project).reformat(it).text
            }
    }

    return result
}

fun convertMarkdownToHTML(markdown: String): String {
    val parser: Parser = Parser.builder().build()
    val document: Node = parser.parse(markdown)
    val htmlRenderer: HtmlRenderer = HtmlRenderer.builder().nodeRendererFactory { CodeBlockRenderer(it.writer) }.build()
    return htmlRenderer.render(document)
}

/**
 * Designed to convert underscore separated words (e.g. UPDATE_COMPLETE) into title cased human readable text
 * (e.g. Update Complete)
 */
fun String.toHumanReadable() = StringUtil.toTitleCase(toLowerCase().replace('_', ' '))

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

fun generateUnifiedPatch(patch: String, filePath: String): TextFilePatch {
    val unifiedPatch = "--- $filePath\n+++ $filePath\n$patch"
    val patchReader = PatchReader(unifiedPatch)
    val patches = patchReader.readTextPatches()
    return patches[0]
}

fun applyPatch(patch: String, fileContent: String, filePath: String): String? {
    val unifiedPatch = generateUnifiedPatch(patch, filePath)
    return PlainSimplePatchApplier.apply(fileContent, unifiedPatch.hunks)
}
