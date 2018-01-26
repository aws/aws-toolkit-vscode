class LazyExtensionProperty {
    fun sample {
        data class SomeClass(val property: String)

        val SomeClass.lazilyEvaluatedExtensionProperty: String by LazyExtensionProperty<SomeClass, String> {
            //some expensive function that determines value of lazilyEvaluatedExtensionProperty
            this.property
        }
    }
}