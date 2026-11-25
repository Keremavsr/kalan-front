import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './i18n';
import { App, createQueryClient } from './App';
import { createApi } from './api/create';

const root = createRoot(document.getElementById('root')!);
const queryClient = createQueryClient();

void createApi().then((api) => {
  root.render(
    <StrictMode>
      <App api={api} queryClient={queryClient} />
    </StrictMode>,
  );
});
