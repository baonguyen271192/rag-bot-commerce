import { useOutletContext } from 'react-router-dom'
import CustomersTab from '../../components/CustomersTab'

export default function StoreCustomersPage() {
  const { store } = useOutletContext()
  return <CustomersTab storeId={store.id} />
}
