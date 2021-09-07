// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.module.kotlin.convertValue
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.codeHighlighting.HighlightDisplayLevel
import com.intellij.codeInspection.LocalInspectionTool
import com.intellij.codeInspection.LocalInspectionToolSession
import com.intellij.codeInspection.ProblemsHolder
import com.intellij.json.JsonBundle
import com.intellij.json.psi.JsonElementVisitor
import com.intellij.json.psi.JsonProperty
import com.intellij.json.psi.JsonValue
import com.intellij.psi.PsiElementVisitor
import com.intellij.util.ObjectUtils
import com.intellij.util.castSafelyTo
import com.intellij.util.containers.ContainerUtil
import com.jetbrains.jsonSchema.JsonSchemaMappingsProjectConfiguration
import com.jetbrains.jsonSchema.extension.JsonLikePsiWalker
import com.jetbrains.jsonSchema.ide.JsonSchemaService
import com.jetbrains.jsonSchema.impl.JsonOriginalPsiWalker
import com.jetbrains.jsonSchema.impl.JsonSchemaObject
import com.jetbrains.jsonSchema.impl.JsonSchemaResolver

class HighlightSpecificUpdatableProperties: LocalInspectionTool() {

    override fun getDefaultLevel(): HighlightDisplayLevel {
        return HighlightDisplayLevel.WARNING
    }

    override fun buildVisitor(holder: ProblemsHolder, isOnTheFly: Boolean, session: LocalInspectionToolSession): PsiElementVisitor {

        //return super.buildVisitor(holder, isOnTheFly)
        val file = holder.file
        if(!file.isWritable) return PsiElementVisitor.EMPTY_VISITOR
        val allRoots = JsonOriginalPsiWalker.INSTANCE.getRoots(file)
        // JSON may have only a single root element
        val root = if (allRoots.size == 1) ObjectUtils.tryCast(
            ContainerUtil.getFirstItem(allRoots),
            JsonValue::class.java
        ) else null
        if (root == null) return PsiElementVisitor.EMPTY_VISITOR

        val service = JsonSchemaService.Impl.get(file.project)

        val virtualFile = file.viewProvider.virtualFile
        if (virtualFile !is DynamicResourceVirtualFile) return PsiElementVisitor.EMPTY_VISITOR

        return db(root, service.getSchemaObject(file)!!, service, holder, session)
    }

    private fun db(root : JsonValue, schema: JsonSchemaObject, service: JsonSchemaService, holder: ProblemsHolder, session: LocalInspectionToolSession) : PsiElementVisitor{
        if (schema == null) return PsiElementVisitor.EMPTY_VISITOR
        val walker = JsonLikePsiWalker.getWalker(root, schema) ?: return PsiElementVisitor.EMPTY_VISITOR
        val project = root.project
        return object: JsonElementVisitor(){
            override fun visitProperty(o: JsonProperty) {
                annotate(o)
                super.visitProperty(o)
            }

            private fun annotate(o: JsonProperty){
                val position = walker.findPosition(o, true) ?: return


               holder.registerProblem(o.nameElement, "Hello World, yayy")



                }
            }
        }
    }



