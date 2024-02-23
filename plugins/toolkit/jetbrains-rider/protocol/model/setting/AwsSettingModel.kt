// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package model.setting

import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.ExternalGenerator
import com.jetbrains.rd.generator.nova.FlowTransform
import com.jetbrains.rd.generator.nova.GeneratorBase
import com.jetbrains.rd.generator.nova.PredefinedType.bool
import com.jetbrains.rd.generator.nova.csharp.CSharp50Generator
import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.kotlin.Kotlin11Generator
import com.jetbrains.rd.generator.nova.setting
import com.jetbrains.rd.generator.nova.source
import com.jetbrains.rd.generator.nova.util.syspropertyOrInvalid
import com.jetbrains.rider.model.nova.ide.IdeRoot
import com.jetbrains.rider.model.nova.ide.SolutionModel
import java.io.File

object AwsSettingsKotlinGenerator : ExternalGenerator(
    Kotlin11Generator(
        FlowTransform.AsIs,
        "com.jetbrains.rider.model",
        File(syspropertyOrInvalid("ktAwsSettingsGeneratedOutput"))
    ),
    IdeRoot
)

object AwsSettingsCSharpGenerator : ExternalGenerator(
    CSharp50Generator(
        FlowTransform.Reversed,
        "JetBrains.Rider.Model",
        File(syspropertyOrInvalid("csAwsSettingsGeneratedOutput"))
    ),
    IdeRoot
)

@Suppress("unused")
object AwsSettingModel : Ext(SolutionModel.Solution) {

    init {
        setting(Kotlin11Generator.Namespace, "software.aws.toolkits.jetbrains.protocol")
        setting(CSharp50Generator.Namespace, "AWS.Toolkit.Rider.Model")

        setting(GeneratorBase.AcceptsGenerator) { generator ->
            generator == AwsSettingsKotlinGenerator.generator ||
                generator == AwsSettingsCSharpGenerator.generator
        }

        source("showLambdaGutterMarks", bool)
            .doc("Flag indicating whether Lambda gutter marks should be shown in editor")
    }
}
