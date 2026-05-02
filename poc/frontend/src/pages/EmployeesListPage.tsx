/**
 * EmployeesListPage — /employees
 * Lists all employees as clickable cards. Entry point for the demo.
 */

import { Link } from 'react-router-dom';
import { EMPLOYEES, type EmployeeProfile } from '../data/employees';

function InitialsAvatar({ employee, size = 48 }: { employee: EmployeeProfile; size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: employee.avatarColor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.38,
      fontWeight: 700,
      color: '#1e293b',
      flexShrink: 0,
    }}>
      {employee.firstName[0]}{employee.lastName[0]}
    </div>
  );
}

export function EmployeesListPage() {
  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Employees</h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Customer Success · {EMPLOYEES.length} people
        </p>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center',
      }}>
        <select style={{
          border: '1px solid #e5e7eb', borderRadius: 6,
          padding: '7px 12px', fontSize: 13, color: '#374151',
          background: '#fff', cursor: 'pointer',
        }}>
          <option>All departments</option>
          <option>Customer Success</option>
          <option>Engineering</option>
          <option>Sales</option>
          <option>People Operations</option>
        </select>
        <select style={{
          border: '1px solid #e5e7eb', borderRadius: 6,
          padding: '7px 12px', fontSize: 13, color: '#374151',
          background: '#fff', cursor: 'pointer',
        }}>
          <option>All managers</option>
          <option>Rachael Alpert</option>
          <option>David Almeida</option>
          <option>Thomas Badeen</option>
          <option>Abigail Anderson</option>
        </select>
      </div>

      {/* Employee cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16,
      }}>
        {EMPLOYEES.map(emp => (
          <Link
            key={emp.id}
            to={`/employee/${emp.id}`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              cursor: 'pointer',
              transition: 'box-shadow 0.15s, border-color 0.15s',
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#bfdbfe';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb';
              }}
            >
              <InitialsAvatar employee={emp} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                  {emp.firstName} {emp.lastName}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                  {emp.title}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                  {emp.department} · {emp.location}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: '#f3f4f6', color: '#6b7280', fontWeight: 500,
                  }}>
                    Reports to {emp.managerName.split(' ')[0]}
                  </span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: '#f3f4f6', color: '#6b7280', fontWeight: 500,
                  }}>
                    Since {new Date(emp.startDate).getFullYear()}
                  </span>
                </div>
              </div>
              <div style={{ color: '#9ca3af', fontSize: 18, marginTop: 4 }}>›</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
