// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.lambda.jvm.invoker

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.RequestStreamHandler
import com.fasterxml.jackson.databind.ObjectMapper
import org.hamcrest.CoreMatchers.equalTo
import org.hamcrest.CoreMatchers.nullValue
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.junit.Test
import java.io.InputStream
import java.io.OutputStream

class StandaloneInvokerTest {
    private val sut = StandaloneInvoker(MethodLocator())
    private val mapper = ObjectMapper()

    @Test
    fun basicInvocation() {
        val result = sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::stringHandler", "hello")
        assertThat(result, equalTo("olleh"))
    }

    @Test(expected = RuntimeException::class)
    fun invalidHandlerName() {
        sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::nonExistentHandler", "hello")
    }

    @Test(expected = RuntimeException::class)
    fun duplicateHandler() {
        sut.invoke("software.aws.lambda.jvm.invoker.ClassWithTwoMethodsOfTheSameName::handlerName", "hello")
    }

    @Test(expected = RuntimeException::class)
    fun invalidHandler() {
        sut.invoke("software.aws.lambda.jvm.invoker.SomeClass", "hello")
    }

    @Test
    fun basicBeanInvocation() {
        val result =
            sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::basicBeanHandler", SOME_BEAN_INPUT) ?: throw AssertionError("result should not be null")

        val resultAsObject = mapper.readValue(result, SomeBean::class.java)

        assertThat(resultAsObject.name, equalTo("werdnA"))
        assertThat(resultAsObject.age, equalTo(60))
    }

    @Test
    fun voidResponseInvocation() {
        val result = sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::voidHandler", "hello")
        assertThat(result, nullValue())
    }

    @Test
    fun noInputInvocation() {
        val result = sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::noInputParameterHandler", null)
        assertThat(result, equalTo("Hello!"))
    }

    @Test
    fun functionWithContextInvocation() {
        val result = sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::contextHandler", "hello") ?: throw AssertionError("result should not be null")
        val resultParts = result.split("/")

        assertThat(resultParts, hasSize(2))
        assertThat(resultParts[0], equalTo("hello"))
        assertThat(resultParts[1].length, greaterThan(10))
    }

    @Test
    fun functionWithBeanInputAndContextInvocation() {
        val result =
            sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::beanAndContextHandler", SOME_BEAN_INPUT) ?: throw AssertionError("result should not be null")
        val resultParts = result.split("/")

        assertThat(resultParts, hasSize(2))
        assertThat(resultParts[0], equalTo("Andrew"))
        assertThat(resultParts[1].length, greaterThan(10))
    }

    @Test
    fun inputStreamInvocation() {
        val result = sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::inputStreamHandler", "hello")
        assertThat(result, equalTo("hello"))
    }

    @Test
    fun inputOutputStreamInvocation() {
        val result = sut.invoke("software.aws.lambda.jvm.invoker.SomeClass::inputStreamAndOutputStream", "hello")
        assertThat(result, equalTo("hello"))
    }

    @Test
    fun classImplementingHandler() {
        val result = sut.invoke("software.aws.lambda.jvm.invoker.SomeClassImplementingHandler", SOME_BEAN_INPUT)
        assertThat(result, equalTo("Andrew"))
    }

    @Test
    fun classImplementingStreamingHandler() {
        val result = sut.invoke("software.aws.lambda.jvm.invoker.SomeClassImplementingStreamingHandler", "hello")
        assertThat(result, equalTo("hello"))
    }

    private companion object {
        val SOME_BEAN_INPUT = """
            {
                "name": "Andrew",
                "age": 50
            }
        """.trimIndent()
    }
}

@Suppress("unused")
class SomeClass {
    fun stringHandler(input: String): String = input.reversed()
    fun basicBeanHandler(input: SomeBean): SomeBean = SomeBean(name = input.name?.reversed(), age = input.age?.plus(10))
    @Suppress("UNUSED_PARAMETER")
    fun voidHandler(input: String) {
    }

    fun noInputParameterHandler(): String = "Hello!"

    fun contextHandler(input: String, context: Context): String = "$input/${context.awsRequestId}"

    fun beanAndContextHandler(input: SomeBean, context: Context): String = "${input.name}/${context.awsRequestId}"

    fun inputStreamHandler(input: InputStream): String = input.bufferedReader().readText()

    fun inputStreamAndOutputStream(input: InputStream, output: OutputStream) {
        input.copyTo(output)
    }
}

@Suppress("unused")
class SomeClassImplementingHandler : RequestHandler<SomeBean, String> {
    override fun handleRequest(input: SomeBean, context: Context): String = input.name!!
}

@Suppress("unused")
class SomeClassImplementingStreamingHandler : RequestStreamHandler {
    override fun handleRequest(input: InputStream, output: OutputStream, context: Context) {
        input.copyTo(output)
    }
}

@Suppress("unused")
class ClassWithTwoMethodsOfTheSameName {
    fun handlerName() {}
    fun handlerName(input: String): String = input
}

data class SomeBean @JvmOverloads constructor(var name: String? = null, var age: Int? = null)