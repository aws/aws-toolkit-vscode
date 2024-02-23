// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package model.daemon

import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.ExternalGenerator
import com.jetbrains.rd.generator.nova.FlowTransform
import com.jetbrains.rd.generator.nova.GeneratorBase
import com.jetbrains.rd.generator.nova.PredefinedType.string
import com.jetbrains.rd.generator.nova.csharp.CSharp50Generator
import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.field
import com.jetbrains.rd.generator.nova.kotlin.Kotlin11Generator
import com.jetbrains.rd.generator.nova.setting
import com.jetbrains.rd.generator.nova.sink
import com.jetbrains.rd.generator.nova.util.syspropertyOrInvalid
import com.jetbrains.rider.model.nova.ide.IdeRoot
import com.jetbrains.rider.model.nova.ide.SolutionModel
import java.io.File

object DaemonKotlinGenerator : ExternalGenerator(
    Kotlin11Generator(
        FlowTransform.AsIs,
        "com.jetbrains.rider.model",
        File(syspropertyOrInvalid("ktDaemonGeneratedOutput"))
    ),
    IdeRoot
)

object DaemonCSharpGenerator : ExternalGenerator(
    CSharp50Generator(
        FlowTransform.Reversed,
        "JetBrains.Rider.Model",
        File(syspropertyOrInvalid("csDaemonGeneratedOutput"))
    ),
    IdeRoot
)

@Suppress("unused")
object LambdaDaemonModel : Ext(SolutionModel.Solution) {

    private val LambdaRequest = structdef {
        field("methodName", string)
        field("handler", string)
    }

    init {
        setting(Kotlin11Generator.Namespace, "software.aws.toolkits.jetbrains.protocol")
        setting(CSharp50Generator.Namespace, "AWS.Toolkit.Rider.Model")

        setting(GeneratorBase.AcceptsGenerator) { generator ->
            generator == DaemonKotlinGenerator.generator ||
                generator == DaemonCSharpGenerator.generator
        }

        sink("runLambda", LambdaRequest)
            .doc("Signal from backend to run lambda on local environment")

        sink("debugLambda", LambdaRequest)
            .doc("Signal from backend to debug lambda on local environemnt")

        sink("createNewLambda", LambdaRequest)
            .doc("Signal from backend to create a new AWS Lambda")
    }
}
