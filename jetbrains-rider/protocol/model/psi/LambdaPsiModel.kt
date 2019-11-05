// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package protocol.model.psi

import java.io.File
import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.async
import com.jetbrains.rd.generator.nova.csharp.CSharp50Generator
import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.field
import com.jetbrains.rd.generator.nova.immutableList
import com.jetbrains.rd.generator.nova.kotlin.Kotlin11Generator
import com.jetbrains.rd.generator.nova.nullable
import com.jetbrains.rd.generator.nova.setting
import com.jetbrains.rd.generator.nova.sink
import com.jetbrains.rd.generator.nova.source
import com.jetbrains.rd.generator.nova.util.syspropertyOrInvalid
import com.jetbrains.rd.generator.nova.ExternalGenerator
import com.jetbrains.rd.generator.nova.GeneratorBase
import com.jetbrains.rd.generator.nova.FlowTransform
import com.jetbrains.rd.generator.nova.PredefinedType.bool
import com.jetbrains.rd.generator.nova.PredefinedType.int
import com.jetbrains.rd.generator.nova.PredefinedType.string
import com.jetbrains.rider.model.nova.ide.IdeRoot
import com.jetbrains.rider.model.nova.ide.ShellModel.IconModel
import com.jetbrains.rider.model.nova.ide.SolutionModel

object PsiKotlinGenerator : ExternalGenerator(
    Kotlin11Generator(FlowTransform.AsIs, "com.jetbrains.rider.model", File(syspropertyOrInvalid("ktGeneratedOutput"))),
    IdeRoot)

object PsiCSharpGenerator : ExternalGenerator(
    CSharp50Generator(FlowTransform.Reversed, "JetBrains.Rider.Model", File(syspropertyOrInvalid("csPsiGeneratedOutput"))),
    IdeRoot)

@Suppress("unused")
object LambdaPsiModel : Ext(SolutionModel.Solution) {

    // DetermineHandlers
    private val DetermineHandlersRequest = structdef {
        field("requestId", int)
    }

    private val HandlerCompletionItem = structdef {
        field("handler", string)
        field("iconId", IconModel.nullable)
    }

    private val DetermineHandlersResponse = structdef {
        field("requestId", int)
        field("value", immutableList(HandlerCompletionItem))
    }

    // IsHandlerExist
    private val HandlerExistRequest = structdef {
        field("requestId", int)
        field("className", string)
        field("methodName", string)
        field("projectId", int)
    }

    private val HandlerExistResponse = structdef {
        field("requestId", int)
        field("value", bool)
    }

    init {
        setting(GeneratorBase.AcceptsGenerator) { generator ->
            generator == PsiKotlinGenerator.generator ||
            generator == PsiCSharpGenerator.generator
        }

        // TODO: This event sourcing model is a trade off for compartibility reasons between 192 and 193 Rider SDK.
        //       Can be replaced with protocol "com.jetbrains.rd.generator.nova.call" when min-version is 19.3 FIX_WHEN_MIN_IS_193,
        //       or when we switch to a branch-per-version release model.
        //
        // Avoid using "call" since it is generated into backward incompartible C# and kotlin models.
        source("determineHandlersRequest", DetermineHandlersRequest).async
            .doc("A source for synchronizing DetermineHandlers request from a frontend to start a backend handlers calculations.")

        sink("determineHandlersResponse", DetermineHandlersResponse).async
            .doc("A signal is set on a backend and get on a frontend with collection of HandlerCompletionItems result.")

        // TODO: This event sourcing model is a trade off for compartibility reasons between 192 and 193 Rider SDK.
        //       Can be replaced with protocol "com.jetbrains.rd.generator.nova.call" when min-version is 19.3 FIX_WHEN_MIN_IS_193,
        //       or when we switch to a branch-per-version release model.
        //
        // Avoid using "call" since it is generated into backward incompartible C# and kotlin models.
        source("isHandlerExistRequest", HandlerExistRequest).async
            .doc("A source to check whether handler with specified name exists for a partucular project.")

        sink("isHandlerExistResponse", HandlerExistResponse).async
            .doc("A signal is set on a backend with handler exist result.")
    }
}
