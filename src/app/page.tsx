import App from '../App'
import { ToastProvider } from '../components/ui/Toast'

export default function HomePage() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}
