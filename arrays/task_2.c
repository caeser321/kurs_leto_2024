#include <stdio.h>
#include <locale.h>

void printReversedArray(int arr[], int N) {
    printf("Вывод –> ");
    for (int i = N - 1; i >= 0; i--) {
        printf("%d ", arr[i]);
    }
    printf("\n");
}

int main() {
    setlocale(LC_ALL, "Russian");  
    int N;

    printf("Введите размер массива N: ");
    scanf("%d", &N);

    int arr[N];

    printf("Введите элементы массива через пробел: ");
    for (int i = 0; i < N; i++) {
        scanf("%d", &arr[i]);
    }

    printReversedArray(arr, N);

    return 0;
}
