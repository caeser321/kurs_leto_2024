#include <stdio.h>
#include <locale.h>

void printMatrix(int N) {
    int matrix[N][N];  
    int count = 1;     

    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            matrix[i][j] = count;
            count++;
        }
    }

    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            printf("%d ", matrix[i][j]);
        }
        printf("\n");
    }
}

int main() {
    setlocale(LC_ALL, "Russian");  
    int N;

    printf("Введите размер матрицы N: ");
    scanf("%d", &N);

    printMatrix(N);
    return 0;
}
