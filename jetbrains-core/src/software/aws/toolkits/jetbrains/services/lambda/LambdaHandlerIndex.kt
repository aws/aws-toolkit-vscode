// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementVisitor
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.util.indexing.DataIndexer
import com.intellij.util.indexing.DefaultFileTypeSpecificInputFilter
import com.intellij.util.indexing.FileBasedIndex
import com.intellij.util.indexing.FileContent
import com.intellij.util.indexing.ID
import com.intellij.util.indexing.ScalarIndexExtension
import com.intellij.util.io.EnumeratorStringDescriptor
import com.intellij.util.io.KeyDescriptor

class LambdaHandlerIndex : ScalarIndexExtension<String>() {
    private val fileFilter by lazy {
        val supportedFiles = LambdaHandlerResolver.supportedLanguages
            .mapNotNull { it.associatedFileType }
            .toTypedArray()
        object : DefaultFileTypeSpecificInputFilter(*supportedFiles) {
            override fun acceptInput(file: VirtualFile): Boolean = file.isInLocalFileSystem
        }
    }

    override fun getName() = NAME

    override fun getVersion(): Int {
        var version = 1 // Base version that is tied to the version of getIndexer

        val runtimeGroups = LambdaHandlerResolver.supportedRuntimeGroups
        for (runtimeGroup in runtimeGroups) {
            val resolver = LambdaHandlerResolver.getInstance(runtimeGroup) ?: continue
            version = version * 31 + (resolver.version() xor resolver::class.java.name.hashCode())
        }

        return version
    }

    override fun dependsOnFileContent() = true

    override fun getIndexer(): DataIndexer<String, Void?, FileContent> = DataIndexer { fileContent ->
        val handlerIdentifier = fileContent.psiFile.language.runtimeGroup?.let { runtimeGroup ->
            LambdaHandlerResolver.getInstance(runtimeGroup)
        } ?: return@DataIndexer emptyMap<String, Void?>()

        val handlers = mutableMapOf<String, Void?>()

        fileContent.psiFile.acceptLeafNodes(object : PsiElementVisitor() {
            override fun visitElement(element: PsiElement?) {
                super.visitElement(element)
                element?.run {
                    handlerIdentifier.determineHandlers(this, fileContent.file).forEach { handlers[it] = null }
                }
            }
        })

        handlers
    }

    override fun getInputFilter(): FileBasedIndex.InputFilter = fileFilter

    override fun getKeyDescriptor(): KeyDescriptor<String> = EnumeratorStringDescriptor.INSTANCE

    companion object {
        private val NAME: ID<String, Void> = ID.create("LambdaHandlerIndex")

        /**
         * Passes the [visitor] to the leaf-nodes in this [PsiElement]'s hierarchy.
         *
         * A leaf-node is a node with no children.
         */
        private fun PsiElement.acceptLeafNodes(visitor: PsiElementVisitor) {
            when {
                children.isEmpty() -> accept(visitor)
                else -> children.forEach { it.acceptLeafNodes(visitor) }
            }
        }

        fun listHandlers(project: Project): Collection<String> {
            val index = FileBasedIndex.getInstance()
            return index.getAllKeys(LambdaHandlerIndex.NAME, project)
                .filter {
                    // Filters out out-of-date data
                    index.getValues(LambdaHandlerIndex.NAME, it, GlobalSearchScope.projectScope(project)).isNotEmpty()
                }
        }
    }
}