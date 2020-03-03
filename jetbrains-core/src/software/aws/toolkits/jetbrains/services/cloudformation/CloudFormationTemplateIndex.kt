// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementVisitor
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.util.indexing.DataIndexer
import com.intellij.util.indexing.DefaultFileTypeSpecificInputFilter
import com.intellij.util.indexing.FileBasedIndex
import com.intellij.util.indexing.FileBasedIndexExtension
import com.intellij.util.indexing.FileContent
import com.intellij.util.indexing.ID
import com.intellij.util.io.DataExternalizer
import com.intellij.util.io.EnumeratorStringDescriptor
import com.intellij.util.io.KeyDescriptor
import org.jetbrains.yaml.YAMLLanguage
import org.jetbrains.yaml.psi.YAMLKeyValue
import software.aws.toolkits.jetbrains.services.cloudformation.yaml.YamlCloudFormationTemplate
import java.io.DataInput
import java.io.DataOutput

class CloudFormationTemplateIndex : FileBasedIndexExtension<String, MutableList<IndexedResource>>() {
    private val fileFilter by lazy {
        val supportedFiles = arrayOf(YAMLLanguage.INSTANCE.associatedFileType)

        object : DefaultFileTypeSpecificInputFilter(*supportedFiles) {
            override fun acceptInput(file: VirtualFile): Boolean = file.isInLocalFileSystem
        }
    }

    override fun getValueExternalizer(): DataExternalizer<MutableList<IndexedResource>> = object : DataExternalizer<MutableList<IndexedResource>> {
        override fun save(dataOutput: DataOutput, value: MutableList<IndexedResource>) {
            dataOutput.writeInt(value.size)
            value.forEach { resource -> resource.save(dataOutput) }
        }

        override fun read(dataInput: DataInput): MutableList<IndexedResource> {
            val resourceCount = dataInput.readInt()
            val resources = mutableListOf<IndexedResource>()
            repeat(resourceCount) {
                resources.add(IndexedResource.read(dataInput))
            }
            return resources
        }
    }

    override fun getName(): ID<String, MutableList<IndexedResource>> = NAME

    override fun getIndexer(): DataIndexer<String, MutableList<IndexedResource>, FileContent> = DataIndexer { fileContent ->
        val indexedResources = mutableMapOf<String, MutableList<IndexedResource>>()

        fileContent.psiFile.acceptNode(object : PsiElementVisitor() {
            override fun visitElement(element: PsiElement) {
                super.visitElement(element)
                // element is nullable in versions prior to 2020.1 FIX_WHEN_MIN_IS_201
                element?.run {
                    val parent = element.parent as? YAMLKeyValue ?: return
                    if (parent.value != this) return

                    val resource = YamlCloudFormationTemplate.convertPsiToResource(parent) ?: return
                    val resourceType = resource.type() ?: return
                    IndexedResource.from(resource)?.let {
                        indexedResources.computeIfAbsent(resourceType) { mutableListOf() }.add(it)
                    }
                }
            }
        })

        indexedResources
    }

    override fun getKeyDescriptor(): KeyDescriptor<String> = EnumeratorStringDescriptor.INSTANCE

    override fun getVersion(): Int = 2

    override fun getInputFilter(): FileBasedIndex.InputFilter = fileFilter

    override fun dependsOnFileContent(): Boolean = true

    companion object {
        private val NAME: ID<String, MutableList<IndexedResource>> = ID.create("CloudFormationTemplateIndex")

        private fun PsiElement.acceptNode(visitor: PsiElementVisitor) {
            accept(visitor)

            if (children.isNotEmpty()) {
                children.forEach { it.acceptNode(visitor) }
            }
        }

        fun listResources(
            project: Project,
            resourceTypeFilter: (String) -> Boolean = { true },
            virtualFile: VirtualFile? = null
        ): Collection<IndexedResource> {
            val index = FileBasedIndex.getInstance()
            val scope = virtualFile?.let { GlobalSearchScope.fileScope(project, it) } ?: GlobalSearchScope.projectScope(project)
            return ApplicationManager.getApplication().runReadAction<Collection<IndexedResource>> {
                index.getAllKeys(NAME, project)
                    .asSequence()
                    .filter(resourceTypeFilter)
                    .mapNotNull { index.getValues(NAME, it, scope) }
                    .filter { it.isNotEmpty() }
                    .flatten()
                    .flatten()
                    .toList()
            }
        }

        fun listResourcesByType(project: Project, type: String): Collection<IndexedResource> = listResources(project, resourceTypeFilter = { it == type })

        fun listFunctions(project: Project, virtualFile: VirtualFile? = null): Collection<IndexedFunction> =
            listResources(project, virtualFile = virtualFile).filterIsInstance(IndexedFunction::class.java)
    }
}
