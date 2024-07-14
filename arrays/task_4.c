#include <stdio.h>

void fillSpiralMatrix(int N) {
    int matrix[N][N];
    int value = 1;
    int top = 0, bottom = N - 1, left = 0, right = N - 1;

    while (value <= N * N) {
        for (int i = left; i <= right; i++) {
            matrix[top][i] = value++;
        }
        top++;

        for (int i = top; i <= bottom; i++) {
            matrix[i][right] = value++;
        }
        right--;

        for (int i = right; i >= left; i--) {
            matrix[bottom][i] = value++;
        }
        bottom--;

        for (int i = bottom; i >= top; i--) {
            matrix[i][left] = value++;
        }
        left++;
    }

    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            printf("%d\t", matrix[i][j]);
        }
        printf("\n");
    }
}

int main() {
    int N;

    printf("Введите размер матрицы N: ");
    scanf("%d", &N);

    fillSpiralMatrix(N);

    return 0;
}
