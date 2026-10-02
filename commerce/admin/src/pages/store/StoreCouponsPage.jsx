import { useOutletContext } from 'react-router-dom'
import CouponsTab from '../../components/CouponsTab'

export default function StoreCouponsPage() {
  const { store } = useOutletContext()
  return <CouponsTab store={store} />
}
