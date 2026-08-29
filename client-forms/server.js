import { config } from './src/config.js';
import { createApp } from './src/app.js';

const app = await createApp(config);

app.listen(config.port, config.host, () => {
  console.log(`Анкета клиента: http://localhost:${config.port}`);
  console.log(`Архив анкет:    http://localhost:${config.port}/archive`);
  console.log(`Общее пространство: ${config.sharedDir}`);
});
