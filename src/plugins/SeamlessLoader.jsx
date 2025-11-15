import React, { useState, useEffect } from 'react';

const SeamlessLoader = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>{loading ? <div>Loading...</div> : <div>Content loaded!</div>}</div>
  );
};

export default SeamlessLoader;
