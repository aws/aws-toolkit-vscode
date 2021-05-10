// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package model.project

import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.ExternalGenerator
import com.jetbrains.rd.generator.nova.FlowTransform
import com.jetbrains.rd.generator.nova.GeneratorBase
import com.jetbrains.rd.generator.nova.PredefinedType.string
import com.jetbrains.rd.generator.nova.call
import com.jetbrains.rd.generator.nova.csharp.CSharp50Generator
import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.field
import com.jetbrains.rd.generator.nova.kotlin.Kotlin11Generator
import com.jetbrains.rd.generator.nova.setting
import com.jetbrains.rd.generator.nova.util.syspropertyOrInvalid
import com.jetbrains.rider.model.nova.ide.IdeRoot
import com.jetbrains.rider.model.nova.ide.SolutionModel
import java.io.File

object AwsProjectKotlinGenerator : ExternalGenerator(
    Kotlin11Generator(
        FlowTransform.AsIs,
        "com.jetbrains.rider.model",
        File(syspropertyOrInvalid("ktAwsProjectGeneratedOutput"))
    ),
    IdeRoot
)

object AwsProjectCSharpGenerator : ExternalGenerator(
    CSharp50Generator(
        FlowTransform.Reversed,
        "JetBrains.Rider.Model",
        File(syspropertyOrInvalid("csAwsProjectGeneratedOutput"))
    ),
    IdeRoot
)

@Suppress("unused")
object AwsProjectModel : Ext(SolutionModel.Solution) {

    private val AwsProjectOutputRequest = structdef {
        field("projectPath", string)
    }

    private val AwsProjectOutput = structdef {
        field("assemblyName", string)
        field("location", string)
    }

    init {
        setting(Kotlin11Generator.Namespace, "software.aws.toolkits.jetbrains.protocol")
        setting(CSharp50Generator.Namespace, "AWS.Toolkit.Rider.Model")

        setting(GeneratorBase.AcceptsGenerator) { generator ->
            generator == AwsProjectKotlinGenerator.generator ||
                generator == AwsProjectCSharpGenerator.generator
        }

        call("getProjectOutput", AwsProjectOutputRequest, AwsProjectOutput)
            .doc("Get AWS project output information")
    }
}
