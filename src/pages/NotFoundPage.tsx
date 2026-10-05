import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <>
      <title>Page not found · Wild Rift Stats</title>
      <div className="page-head">
        <h1>Page not found</h1>
        <p className="lede">
          There’s nothing at this address. <Link to="/">Go to the tier list</Link>
        </p>
      </div>
    </>
  )
}
