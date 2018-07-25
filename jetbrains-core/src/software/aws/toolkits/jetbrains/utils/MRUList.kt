package software.aws.toolkits.jetbrains.utils

class MRUList<T>(private val maxSize: Int) {
    private val internalList = mutableListOf<T>()

    fun add(element: T) {
        internalList.remove(element)
        internalList.add(0, element)
        trimToSize()
    }

    fun elements(): List<T> {
        return internalList.toList()
    }

    private fun trimToSize() {
        while (internalList.size > maxSize) {
            internalList.removeAt(internalList.size - 1)
        }
    }
}