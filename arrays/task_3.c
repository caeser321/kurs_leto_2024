#include <stdio.h>
#include <locale.h>

void fillMatrix(int N) {
    int matrix[N][N];

    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            if (j >= N - i - 1) {
                matrix[i][j] = 1;
            } else {
                matrix[i][j] = 0;
            }
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

    fillMatrix(N);

    return 0;
}
